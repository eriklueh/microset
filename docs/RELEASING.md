# Publicar una versión (con auto-update)

microset usa `tauri-plugin-updater`: la app instalada chequea al abrir el manifiesto
`latest.json` del último release en GitHub, y si hay una versión nueva ofrece
descargarla, instalarla y reiniciar. Para que funcione, **cada release** debe publicar el
instalador **firmado** + un `latest.json` actualizado.

> El auto-update empieza a funcionar a partir de la **primera versión que ya incluya el
> plugin** (≥ v0.1.1). Quien tenga v0.1.0 instalada tendrá que actualizar una vez a mano;
> de ahí en adelante es automático.

## Claves de firma del updater

- Par generado con `pnpm tauri signer generate`. La **pública** vive en
  `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).
- La **privada** está en `C:\Users\Erik\.tauri\microset_updater.key` (sin password).
  **NO se commitea.** Para CI, guardala como secreto `TAURI_SIGNING_PRIVATE_KEY`.
- Si se pierde la privada, hay que generar otra y los clientes viejos no podrán
  auto-actualizar (tendrán que reinstalar a mano una vez).

## Pasos para cortar una versión

1. **Subí la versión** en `src-tauri/tauri.conf.json` y `package.json` (y `Cargo.toml`),
   p. ej. `0.1.1`. Commiteá.

2. **Build firmado.** En PowerShell, exportá la clave privada y buildeá:

   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content C:\Users\Erik\.tauri\microset_updater.key -Raw
   # $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""   # la clave no tiene password
   pnpm tauri build --bundles nsis
   ```

   Esto genera en `src-tauri/target/release/bundle/nsis/`:
   - `microset_<ver>_x64-setup.exe`
   - `microset_<ver>_x64-setup.exe.sig`  ← firma del updater

3. **Generá el manifiesto** `latest.json`:

   ```powershell
   node scripts/make-latest.mjs "Que hay de nuevo en esta version"
   ```

4. **Publicá el release** con el instalador (nombre versionado + el estable que usa la
   landing) y el manifiesto:

   ```powershell
   $nsis = "src-tauri/target/release/bundle/nsis"
   Copy-Item "$nsis/microset_<ver>_x64-setup.exe" "$nsis/microset-setup-x64.exe" -Force
   gh release create v<ver> --repo eriklueh/microset --title "microset v<ver>" `
     --notes-file notas.md `
     "$nsis/microset_<ver>_x64-setup.exe" `
     "$nsis/microset-setup-x64.exe" `
     "$nsis/latest.json"
   ```

   - `microset-setup-x64.exe` → lo que linkea el botón de la landing (nombre estable).
   - `latest.json` → lo que lee el updater (`releases/latest/download/latest.json`).
   - `microset_<ver>_x64-setup.exe` → lo que descarga el updater (URL del manifiesto).

5. Listo. Las apps instaladas detectan la nueva versión al reabrir.

## Firma del instalador (code-signing) — distinto del updater

El `.sig` de arriba es la firma **del updater** (garantiza que el update es auténtico). NO
es lo mismo que firmar el `.exe` con un certificado (Authenticode) para evitar el aviso de
SmartScreen de Windows. El updater funciona sin code-signing; el aviso de SmartScreen es
otro tema (ver Azure Trusted Signing). 
