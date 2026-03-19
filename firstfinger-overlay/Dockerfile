FROM node:18-alpine AS ui-builder

WORKDIR /src
RUN apk add --no-cache git make python3 g++
RUN npm install -g corepack && corepack prepare yarn@4.9.4 --activate

RUN git clone https://github.com/Harsh-2002/MinIO-Object-Browser.git . \
    && git checkout v1.7.6

COPY patches/ldap-login.patch /tmp/ldap-login.patch
RUN git apply /tmp/ldap-login.patch \
    && sed -i 's#https://github.com/minio/mds.git#v1.1.5#https://codeload.github.com/minio/mds/tar.gz/refs/tags/v1.1.5#' web-app/package.json \
    && cd web-app \
    && yarn install \
    && make build-static

FROM golang:1.23-alpine AS builder

WORKDIR /src
RUN apk add --no-cache git make

RUN git clone https://github.com/Harsh-2002/MinIO-Object-Browser.git . \
    && git checkout v1.7.6

COPY patches/ldap-login.patch /tmp/ldap-login.patch
RUN git apply /tmp/ldap-login.patch
COPY --from=ui-builder /src/web-app/build /src/web-app/build
RUN make console

FROM firstfinger/minio:latest
COPY --from=builder /src/console /usr/bin/console
