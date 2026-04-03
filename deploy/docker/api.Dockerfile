# Python API service — replace with your production install (dependencies, app code).
FROM python:3.12-slim-bookworm
WORKDIR /app
ENV PYTHONUNBUFFERED=1
RUN useradd --create-home --uid 10001 appuser
COPY deploy/docker/api.placeholder/server.py /app/server.py
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz')" || exit 1
CMD ["python", "/app/server.py"]
