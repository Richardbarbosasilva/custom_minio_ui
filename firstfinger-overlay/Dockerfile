FROM golang:1.23-alpine AS builder

WORKDIR /src
RUN apk add --no-cache git make

RUN git clone https://github.com/Harsh-2002/MinIO-Object-Browser.git . \
    && git checkout v1.7.6

COPY patches/ldap-login.patch /tmp/ldap-login.patch
RUN git apply /tmp/ldap-login.patch \
    && make console

FROM firstfinger/minio:latest
COPY --from=builder /src/console /usr/bin/console
