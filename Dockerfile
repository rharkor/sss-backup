FROM oven/bun:latest as base
WORKDIR /usr/src/app

RUN mkdir -p /temp/prod
COPY package.json bun.lockb /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

FROM base AS release
COPY --from=base /temp/prod/node_modules node_modules
COPY . .

ENV NODE_ENV=production

# run the app
USER bun
ENTRYPOINT [ "bun", "run", "start" ]
