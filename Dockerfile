#node:18.20.2
FROM 983911888104.dkr.ecr.eu-west-1.amazonaws.com/seaverse-backend:base-image

WORKDIR /usr/src/app
# Install LibreOffice and ffmpeg
RUN apt-get update && \
    apt-get install -y libreoffice ffmpeg  && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*


COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 8094

CMD ["npm", "run", "stage"]