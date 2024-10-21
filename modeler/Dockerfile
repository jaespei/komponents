FROM node:16
LABEL org.opencontainers.image.authors="jesparza@dsic.upv.es"
LABEL description="Komponents Modeler"
EXPOSE 8080

COPY . /app/
WORKDIR /app
RUN npm install

ENTRYPOINT npm run serve
