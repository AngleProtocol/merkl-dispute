#!/bin/bash

echo "Please enter the version to publish in the following format: vX.X.X "
read version

echo "Building docker image"
docker build -t merkl-dispute:latest --platform linux/amd64 .

accounts=("merkl-dispute-1") #"merkl-dispute-2")

for account in "${accounts[@]}"
do
    docker tag merkl-dispute:latest europe-west1-docker.pkg.dev/$account/registry/merkl-dispute:$version
done

for account in "${accounts[@]}"
do
    echo "Login to google account of $account"
    gcloud auth login

    echo "Login to docker registry $account"
    gcloud auth configure-docker europe-west1-docker.pkg.dev

    echo "Pushing to docker registry 1"
    docker push europe-west1-docker.pkg.dev/$account/registry/merkl-dispute:$version
done
