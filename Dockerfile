FROM node:24-alpine

WORKDIR /app

# Install production dependencies (tsx is a runtime dep — no build step).
COPY package.json ./
RUN npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
