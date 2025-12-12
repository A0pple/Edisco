# Docker Build & Push Instructions for Edisco

## Prerequisites
- Docker installed and running
- Docker Hub account created
- Logged into Docker Hub locally

## Step 1: Build the Docker Image Locally

```bash
# Navigate to your project directory
cd /workspaces/Edisco

# Build the image
docker build -t ofekmoyal/edisco:latest .

# Or with a specific version tag
docker build -t ofekmoyal/edisco:1.0.0 .
```

## Step 2: Test the Image Locally

```bash
# Run the container (requires sudo for port 80)
sudo docker run -p 80:8000 ofekmoyal/edisco:latest

# Or using docker-compose
sudo docker-compose up -d

# Access the app at http://localhost
```

### Verify the app is running:
```bash
curl http://localhost
```

**Note:** `sudo` is required because port 80 is a privileged port. The app runs on port 8000 internally but is exposed as port 80 on localhost.

### View logs:
```bash
docker logs edisco-app
```

### Stop the container:
```bash
docker compose down
# OR
docker stop <container_id>
```

## Step 3: Login to Docker Hub

```bash
docker login
# Enter your Docker Hub username and password when prompted
```

## Step 4: Push to Docker Hub

```bash
# Push the latest tag
docker push ofekmoyal/edisco:latest

# If you built with a version tag, push that too
docker push ofekmoyal/edisco:1.0.0
```

## Step 5: Verify on Docker Hub

Visit https://hub.docker.com/r/ofekmoyal/edisco to see your image.

## Optional: Running Others' Images

Others can now run your image with:
```bash
sudo docker run -p 80:8000 ofekmoyal/edisco:latest
```

Or with docker-compose:
```bash
sudo docker-compose up -d
```

With a docker-compose.yml file containing:
```yaml
version: '3.8'
services:
  edisco:
    image: ofekmoyal/edisco:latest
    ports:
      - "80:8000"
    restart: unless-stopped
```

Access the app at **http://localhost**

## Useful Docker Commands

```bash
# List images
docker images

# Remove an image
docker rmi ofekmoyal/edisco:latest

# View container logs
docker logs -f <container_id>

# Stop all containers
docker stop $(docker ps -q)

# Remove all stopped containers
docker container prune

# View running containers
docker ps

# Build and push in one command
docker buildx build --push -t ofekmoyal/edisco:latest .
```

## Notes

- The Dockerfile uses Python 3.11-slim for a smaller image size
- Includes healthcheck to monitor container health
- Exposes port 8000 (FastAPI default)
- Includes .dockerignore to exclude unnecessary files from the image
- docker-compose.yml provided for easy local testing
