# BLU Costa static site export

Unpacked from the user-supplied `blucostatravel.com.zip` archive.

The archive's downloader-generated query suffixes were normalized to ordinary
web filenames and references. Cloudflare challenge snippets injected into the
captured HTML were removed because `/cdn-cgi/` is not part of this static site.
The site's own HTML, CSS, JavaScript, images and PDF portfolio files are kept.

Serve this directory as a static document root; start at `index.html`.
