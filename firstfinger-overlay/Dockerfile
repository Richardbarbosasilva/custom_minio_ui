FROM node:18-alpine AS ui-builder

WORKDIR /src
RUN apk add --no-cache git make python3 g++
RUN npm install -g corepack && corepack prepare yarn@4.9.4 --activate

RUN git clone https://github.com/Harsh-2002/MinIO-Object-Browser.git . \
    && git checkout v1.7.6

COPY patches/ldap-login.patch /tmp/ldap-login.patch
RUN git apply /tmp/ldap-login.patch \
    && python3 -c "import json; from pathlib import Path; p = Path('/src/web-app/package.json'); d = json.loads(p.read_text()); d['dependencies']['mds'] = 'https://github.com/OpenMaxIO/mds.git#commit=027fb7f9834e2bd6daba7f62a9d04d9a3606fbe1'; d['packageManager'] = 'yarn@4.9.4'; p.write_text(json.dumps(d, indent=2) + '\\n')" \
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
