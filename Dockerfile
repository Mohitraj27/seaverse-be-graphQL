FROM node:18.20.2

WORKDIR /usr/src/app

# RUN apt-get update && \
#     apt-get install -y ffmpeg

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 8094

CMD ["npm", "run", "stage"]