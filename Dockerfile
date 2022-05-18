FROM node:16-alpine3.15 as ts
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
COPY --from=ts /usr/app/package*.json ./
COPY --from=ts /usr/app/build ./build
RUN npm install --only=production

#######################

FROM gcr.io/distroless/nodejs:16
WORKDIR /usr/app
COPY --from=js /usr/app ./
# USER 1000
CMD [ "main.js"]
