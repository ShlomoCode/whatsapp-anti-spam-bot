FROM oven/bun:alpine

WORKDIR /app

RUN apk add --no-cache tzdata && ln -sf /usr/share/zoneinfo/Asia/Jerusalem /etc/localtime && echo "Asia/Jerusalem" > /etc/timezone

COPY package.json bun.lock ./
RUN bun install --production && rm -rf /root/.bun/install/cache

COPY . .

ENV NODE_ENV=production

CMD ["bun", "start"]