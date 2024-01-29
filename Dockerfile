FROM node:20-alpine as base
WORKDIR /usr/src/app

RUN mkdir -p /temp/prod
COPY package.json package-lock.json /temp/prod/
RUN cd /temp/prod && bun install --production

FROM base AS release
COPY --from=base /temp/prod/node_modules node_modules
COPY . .

ENV NODE_ENV=production

# run the app
ENTRYPOINT [ "npm", "run", "start" ]
