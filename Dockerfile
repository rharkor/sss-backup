FROM node:20-alpine as base
WORKDIR /usr/src/app

# Update package index and install coreutils
RUN apk update && apk add coreutils && apk add bash

#* GPG
# Add gpg
RUN apk add --no-cache gnupg

RUN mkdir -p /temp/prod
COPY package.json package-lock.json /temp/prod/
RUN cd /temp/prod && npm install --only=production

FROM base AS release
COPY --from=base /temp/prod/node_modules node_modules
COPY . .

ENV NODE_ENV=production

# run the app
ENTRYPOINT [ "bash", "start.sh" ]
