FROM node:16-alpine

# build time
ARG SSL_CERT
ARG SSL_KEY
ARG MCG_ADMIN_WEBID_EMAIL
ARG MCG_ADMIN_WEBID_PASSWORD

# runtime only
ENV PORT=443
ENV BASE_URL=https://localhost
ENV SOLID_LOG_LEVEL=info
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
ENV MCG_ADMIN_WEBID_EMAIL=${MCG_ADMIN_WEBID_EMAIL}
ENV MCG_ADMIN_WEBID_PASSWORD=${MCG_ADMIN_WEBID_PASSWORD}

RUN apk add gettext git
RUN mkdir /data
WORKDIR /app

COPY existing-pod.patch existing-pod.patch

# RUN npm install -g @solid/community-server
RUN git clone https://github.com/CommunitySolidServer/CommunitySolidServer.git
RUN cd CommunitySolidServer && git checkout v5.1.0 && npm ci

RUN echo "$SSL_CERT" > CommunitySolidServer/cert.pem
RUN echo "$SSL_KEY" > CommunitySolidServer/key.pem
COPY config.json CommunitySolidServer/config.json

COPY seeded-config.template.json .
RUN cat seeded-config.template.json | envsubst > CommunitySolidServer/seeded-config.json

ENTRYPOINT echo "starting on: "${BASE_URL} && \
  cd CommunitySolidServer && \
  npm start -- --baseUrl "${BASE_URL}/" \
  --config config.json --port ${PORT} \
  --rootFilePath /data --seededPodConfigJson ./seeded-config.json \
  --httpsKey ./key.pem --httpsCert ./cert.pem \
  --loggingLevel ${SOLID_LOG_LEVEL} -w -1