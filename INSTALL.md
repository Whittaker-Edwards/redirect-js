# we.redirect.js — Install (PHP site)

A ~7 KB standalone script for the page `<head>`. No build step, no dependencies.
Config is read from `data-we-*` attributes on the `<script>` tag.

On load it does one of two things:

1. If the URL has a `?r=` parameter, it `location.replace()`s to that URL.
2. Otherwise, it injects any GTM / Meta Pixel you've configured.

## Install

Copy `we.redirect.min.js` somewhere web-served (e.g. `/assets/js/`), then add
this **first in `<head>`** (e.g. your `header.php`):

```html
<script src="/assets/js/we.redirect.min.js"></script>
```

GTM and the Meta Pixel can be attached via attributes (both optional):

```html
<script
  src="/assets/js/we.redirect.min.js"
  data-we-gtm="GTM-XXXXXXX"
  data-we-pixel="000000000000000"></script>
```

## Redirects

Point a link at the page with `?r=` holding the destination URL, placed **last**
in the query string:

```
https://your-site.com/lp.php?utm_source=fb&r=https://go.example.com/offer
```

Other query params and ad click ids (`fbclid`, `gclid`, `gbraid`, `wbraid`) are
carried onto the destination automatically. Only `http(s)://` targets are
honored.
