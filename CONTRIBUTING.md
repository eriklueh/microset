# Contribuir a microset

¡Gracias por el interés! microset es open source (MIT) y las contribuciones son bienvenidas.

## Desarrollo

Requisitos: [pnpm](https://pnpm.io), [Rust](https://www.rust-lang.org) estable y los
[prerequisitos de Tauri v2](https://v2.tauri.app/start/prerequisites/) para tu sistema.

```bash
pnpm install
pnpm tauri dev        # corre la app (Vite + cargo)
pnpm build            # type-check + build del frontend
pnpm tauri build      # instaladores de producción
```

**pnpm es obligatorio** (no npm). Detalles y gotchas en [CLAUDE.md](CLAUDE.md).

## Lineamientos

- El motor de scheduling vive en `src/lib/engine/` como funciones puras con tests; mantené
  la lógica de negocio fuera de los componentes.
- Identificadores de código en inglés; el copy de cara al usuario puede estar en español
  (y debe ir hacia bilingüe EN/ES — ver roadmap).
- Lenguaje de diseño "Manifiesto": superficies opacas, sin redondeos, reglas finas, mono
  para labels/números, acento lima. Tokens en `src/index.css`.
- Antes de abrir un PR: `pnpm build` en verde y, si tocaste Rust, `cargo check` en
  `src-tauri/`.

## Reportar bugs / ideas

Abrí un [issue](https://github.com/eriklueh/microset/issues) describiendo qué esperabas,
qué pasó, y tu sistema operativo (Windows 11 o Linux/Wayland).
