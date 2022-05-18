FROM node:16-alpine3.15 as base
WORKDIR /usr/app
COPY package*.json ./
COPY tsconfig*.json ./
RUN npm install
COPY ./src ./src
RUN npm run build:release

#######################

FROM node:16-alpine3.15 as js
ENV NODE_ENV production
WORKDIR /usr/app
COPY --from=base /usr/app/package*.json ./
COPY --from=base /usr/app/build/src ./
RUN npm install --only=production

#######################

FROM gcr.io/distroless/nodejs:16
WORKDIR /usr/app
COPY --from=js /usr/app ./
COPY config/* ./config/
USER 1000
CMD [ "main.js"]
