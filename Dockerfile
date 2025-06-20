FROM node:18.20.2

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 8094

CMD ["npm", "run", "stage"]