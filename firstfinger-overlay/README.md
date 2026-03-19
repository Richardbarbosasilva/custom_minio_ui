Build overlay for `firstfinger/minio:latest`.

This keeps the original runtime image and replaces only `/usr/bin/console`
with a binary built from `Harsh-2002/MinIO-Object-Browser` tag `v1.7.6`
plus the LDAP login fallback patch in `patches/ldap-login.patch`.
The overlay rebuilds both the React frontend assets and the Go console binary,
so UI changes are embedded in the final `console` executable.

The patch also keeps local `Users` and `Groups` visible when LDAP is enabled,
adds LDAP identity context to the `Access Keys` page, and redirects the default
home route to `Monitoring > Metrics`.
