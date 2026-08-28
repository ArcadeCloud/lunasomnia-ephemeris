# pyswisseph se prevodi iz izvora, pa je gradnja odvojena od pokretanja: alat za
# prevodjenje ostaje u prvoj slici i ne nosi se u isporuku.
FROM python:3.13-slim AS build
WORKDIR /w
# build-essential, ne samo gcc: pyswisseph prevodi C i trazi zaglavlja standardne
# biblioteke (math.h), koja u slim slici dolaze uz libc6-dev.
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.13-slim
COPY --from=build /install /usr/local
WORKDIR /srv
COPY app/ app/
COPY ephe/ ephe/
COPY LICENSE NOTICE README.md ./
# Ne radi kao root: servis prima podatke sa mreze i nema razloga za vise prava.
RUN useradd --system --uid 10001 sluzba && chown -R sluzba /srv
USER sluzba
ENV PORT=8080 PYTHONUNBUFFERED=1
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=4).status==200 else 1)"
CMD ["python", "-m", "app.server"]
