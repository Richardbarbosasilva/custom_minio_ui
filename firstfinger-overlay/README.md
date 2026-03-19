Build overlay for `firstfinger/minio:latest`.

This keeps the original runtime image and replaces only `/usr/bin/console`
with a binary built from `Harsh-2002/MinIO-Object-Browser` tag `v1.7.6`
plus the LDAP login fallback patch in `patches/ldap-login.patch`.
