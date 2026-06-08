# Guide diagrams

The flowcharts in the guides are committed here as **SVG**, rendered from **Mermaid** sources
(`*.mmd`). The `.mmd` files are the **source of truth** — edit the `.mmd`, then re-render its `.svg`.

| Diagram | Source | Image | Used in |
|---|---|---|---|
| Install flow | `install-flow.mmd` | `install-flow.svg` | `installation.md` |
| Request flow | `request-flow.mmd` | `request-flow.svg` | `marketing-user-guide.md` §2 |
| Golden path | `golden-path.mmd` | `golden-path.svg` | `marketing-user-guide.md` §5 |
| Publish boundary | `publish-boundary.mmd` | `publish-boundary.svg` | `marketing-user-guide.md` §6 |
| Creative-run | `creative-run.mmd` | `creative-run.svg` | `marketing-user-guide.md` §7 |

## Re-render

Use the standard Mermaid CLI. It writes **native-text SVG** (portable — renders on GitHub):

```bash
cd .prepkit/docs/guides/assets
for f in *.mmd; do
  npx -y @mermaid-js/mermaid-cli@10 -i "$f" -o "${f%.mmd}.svg" -c mermaid-config.json
done
```

`mermaid-config.json` sets `htmlLabels:false` so labels are native SVG `<text>`.

> **Pin to v10.** Mermaid **v11** emits `<foreignObject>` labels even with `htmlLabels:false`, and
> GitHub's SVG sanitizer strips `foreignObject` (labels would vanish). v10 emits `<text>`, which
> renders everywhere.
