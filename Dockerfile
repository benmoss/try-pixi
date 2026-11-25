FROM caddy:2.10.2-alpine
RUN apk add --no-cache zstd
COPY Caddyfile /etc/caddy/Caddyfile
COPY dist /srv
RUN find /srv/bin /srv/assets -type f \( -name pixi -o -name '*.wasm' -o -name '*.js' -o -name '*.mjs' -o -name '*.css' \) \
      -exec gzip -k -9 {} \; -exec zstd -q -19 -T0 {} \;
