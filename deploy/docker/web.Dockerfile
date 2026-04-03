# Static web / reverse-proxy front — replace with your built SPA or Next standalone output.
FROM nginx:1.27-alpine
COPY deploy/docker/web.placeholder/default.conf /etc/nginx/conf.d/default.conf
COPY deploy/docker/web.placeholder/public /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
