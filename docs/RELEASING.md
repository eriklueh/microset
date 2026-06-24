# Publicar una versión (con auto-update)

microset usa `tauri-plugin-updater`: la app instalada chequea al abrir el manifiesto
`latest.json` del último release en GitHub, y si hay una versión nueva ofrece
descargarla, instalarla y reiniciar. Para que funcione, **cada release** debe publicar los
instaladores **firmados** + un `latest.json` actualizado.

> El auto-update empieza a funcionar a partir de la **primera versión que ya incluya el
> plugin** (≥ v0.1.1). Quien tenga v0.1.0 instalada tendrá que actualizar una vez a mano;
> de ahí en adelante es automático.

La app está configurada para **Windows + Linux**: `tauri.conf.json` tiene `targets: "all"` y
`createUpdaterArtifacts: true`, y el updater apunta a
`releases/latest/download/latest.json`. Falta solamente **publicar** un release que traiga
los bundles firmados + el manifiesto. Hay dos caminos: CI (recomendado) o manual.

## Claves de firma del updater

- Par generado con `pnpm tauri signer generate`. La **pública** vive en
  `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).
- La **privada** está en `C:\Users\Erik\.tauri\microset_updater.key` (sin password).
  **NO se commitea.**
- Si se pierde la privada, hay que generar otra y los clientes viejos no podrán
  auto-actualizar (tendrán que reinstalar a mano una vez).

---

## Camino A — CI (recomendado): un tag publica todo

`.github/workflows/release.yml` buildea Windows + Linux en paralelo, los firma, genera
`latest.json` y crea el release con todo adentro (incluidos los alias estables que linkea la
landing). Es la única forma simple de tener los dos sistemas + auto-update sin tener dos
máquinas a mano.

**Setup (una sola vez):** guardá la clave privada del updater como secreto del repo.

```powershell
gh secret set TAURI_SIGNING_PRIVATE_KEY --repo eriklueh/microset `
  --body (Get-Content C:\Users\Erik\.tauri\microset_updater.key -Raw)
```

**Cortar una versión:**

1. Subí la versión en `src-tauri/tauri.conf.json` **y** `package.json` (y `src-tauri/Cargo.toml`),
   p. ej. `0.1.1`. Commiteá y pusheá.
2. Etiquetá y pusheá el tag — eso dispara el workflow:

   ```powershell
   git tag v0.1.1
   git push origin v0.1.1
   ```

3. Mirá la corrida en la pestaña **Actions**. Al terminar, el release `v0.1.1` queda con:
   - `microset_0.1.1_x64-setup.exe` (+ `.sig`) y `microset_0.1.1_amd64.AppImage` (+ `.sig`)
   - `latest.json` ← lo que lee el updater
   - `microset-setup-x64.exe` y `microset-x64.AppImage` ← **alias estables** que linkea la landing

> El tag (`v0.1.1`) tiene que coincidir con la `version` de `tauri.conf.json`, o el updater
> verá una versión que no matchea el bundle.

---

## Camino B — manual (fallback)

Sirve si no querés usar CI. Para tener **ambos** sistemas hay que buildear en cada uno
(Windows y una máquina Linux — p. ej. la CachyOS), juntar los bundles y armar un solo
`latest.json`. Si solo buildeás en Windows, el release queda **Windows-only** (Linux sin
auto-update hasta el próximo release que lo incluya).

1. **Subí la versión** en `tauri.conf.json`, `package.json` y `Cargo.toml`. Commiteá.

2. **Build firmado** (en cada sistema). PowerShell (Windows):

   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content C:\Users\Erik\.tauri\microset_updater.key -Raw
   pnpm tauri build --bundles nsis
   ```

   Linux (la clave privada tiene que estar disponible ahí también):

   ```bash
   export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/microset_updater.key)"
   pnpm tauri build --bundles appimage
   ```

   Genera, según el sistema:
   - `target/release/bundle/nsis/microset_<ver>_x64-setup.exe` (+ `.sig`)
   - `target/release/bundle/appimage/microset_<ver>_amd64.AppImage` (+ `.sig`)

3. **Generá el manifiesto** `latest.json`. El script incluye las plataformas cuyos `.sig`
   encuentre, así que corrélo donde tengas los bundles (o copiá ambos `.sig` a una sola
   máquina antes):

   ```powershell
   node scripts/make-latest.mjs "Que hay de nuevo en esta version"
   # → src-tauri/target/release/bundle/latest.json
   ```

4. **Publicá el release** con los bundles versionados, los **alias estables** que usa la
   landing, y el manifiesto:

   ```powershell
   $b = "src-tauri/target/release/bundle"
   Copy-Item "$b/nsis/microset_<ver>_x64-setup.exe"     "$b/microset-setup-x64.exe" -Force
   Copy-Item "$b/appimage/microset_<ver>_amd64.AppImage" "$b/microset-x64.AppImage"  -Force
   gh release create v<ver> --repo eriklueh/microset --title "microset v<ver>" `
     --notes-file notas.md `
     "$b/nsis/microset_<ver>_x64-setup.exe" `
     "$b/appimage/microset_<ver>_amd64.AppImage" `
     "$b/microset-setup-x64.exe" `
     "$b/microset-x64.AppImage" `
     "$b/latest.json"
   ```

   - `microset-setup-x64.exe` / `microset-x64.AppImage` → nombres **estables** que linkea la landing.
   - `latest.json` → lo que lee el updater (`releases/latest/download/latest.json`).
   - bundles versionados → lo que descarga el updater (URLs dentro del manifiesto).

5. Listo. Las apps instaladas detectan la nueva versión al reabrir.

---

## Firma del instalador (code-signing) — distinto del updater

El `.sig` de arriba es la firma **del updater** (garantiza que el update es auténtico). NO
es lo mismo que firmar el `.exe` con un certificado (Authenticode) para evitar el aviso de
SmartScreen de Windows. El updater funciona sin code-signing; el aviso de SmartScreen es
otro tema (ver Azure Trusted Signing). En Linux el AppImage no necesita firma del sistema.
