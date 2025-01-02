#!/bin/bash
docker run -d \
  --name apiuat-seaverse-backend \
  --log-driver awslogs \
  --log-opt awslogs-region=ap-south-1 \
  --log-opt awslogs-group=/docker/container/logs \
  --log-opt awslogs-stream=apiuat-seaverse-backend \
  --restart always \
  -p 8095:8094 \
  apiuat-seaverse-backend
