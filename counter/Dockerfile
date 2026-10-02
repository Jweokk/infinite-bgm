FROM python:3.12-slim

WORKDIR /app
COPY server.py /app/server.py

ENV BGM_DATA_DIR=/data \
    BGM_PORT=8080 \
    PYTHONUNBUFFERED=1

RUN mkdir -p /data

EXPOSE 8080

# python:3.12-slim has no wget/curl — probe with the interpreter itself.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python3 -c "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=3).status == 200 else 1)"

CMD ["python3", "-u", "/app/server.py"]
