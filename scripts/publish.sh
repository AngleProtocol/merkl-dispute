#!/bin/bash
account=$1
version=$2
token=$3

echo "Building docker image"
docker build --build-arg GITHUB_TOKEN=$token -t merkl-dispute:latest --platform linux/amd64 .

docker tag merkl-dispute:latest europe-west1-docker.pkg.dev/$account/registry/merkl-dispute:$version

echo "Login to docker registry $account"

gcloud auth configure-docker europe-west1-docker.pkg.dev

echo "Pushing to docker registry 1"
docker push europe-west1-docker.pkg.dev/$account/registry/merkl-dispute:$version
