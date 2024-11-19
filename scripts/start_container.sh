#!/bin/bash
docker run -d \
  --name apiweb-seaverse-backend \
  --log-driver awslogs \
  --log-opt awslogs-region=ap-south-1 \
  --log-opt awslogs-group=/docker/container/logs \
  --log-opt awslogs-stream=apiweb-seaverse-backend \
  -p 8095:8094 \
  apiweb-seaverse-backend