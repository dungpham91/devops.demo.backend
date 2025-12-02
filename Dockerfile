FROM node:25-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN apk update && apk upgrade --no-cache && npm install
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
