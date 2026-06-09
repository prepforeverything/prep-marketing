# Landing pages (build output)

`/mkt-build-landing-page` writes each conversion landing page here as a self-contained folder:

    <slug>/
      index.html
      chinh-sach-bao-mat.html   (+ terms / payment policy pages)
      <images>
      copy.md                   (claim-tagged source copy)

`/mkt-publish` then takes an approved page live on Cloudflare Pages. Generated images are git-ignored here;
the publish step copies them into the publish repo. See the runbook:
`.prepkit/docs/guides/landing-page-publishing.md`.
