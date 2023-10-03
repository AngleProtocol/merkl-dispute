#!/bin/bash

account=$1
version=$2

chainKeys=("polygon" "ethereum" "optimism" "arbitrum" "zkevm" "base")
chainValues=(137 1 10 42161 1101 8453)

for ((i=0; i<${#chainKeys[@]}; i++))
do
    chain=${chainKeys[$i]}

    echo "Updating merkl-dispute-${chain} to $account with version $version"

    cp scripts/templates/cloudrun.yaml ./cloudrun.yaml

    export APP_NAME=merkl-dispute-$chain
    yq -i '.metadata.name=strenv(APP_NAME)' ./cloudrun.yaml

    export IMAGE=europe-west1-docker.pkg.dev/$account/registry/merkl-dispute:$version
    yq -i '.spec.template.spec.containers[0].image= strenv(IMAGE)' ./cloudrun.yaml

    export CHAIN_ID=${chainValues[$i]}
    yq -i '.spec.template.spec.containers[0].env[0].value= strenv(CHAIN_ID)' ./cloudrun.yaml

    export SERVICE_ACCOUNT=merkl-dispute-sa@$account.iam.gserviceaccount.com
    yq -i '.spec.template.spec.serviceAccountName= strenv(SERVICE_ACCOUNT)' ./cloudrun.yaml

    gcloud run services replace ./cloudrun.yaml --platform managed --region europe-west1
    rm ./cloudrun.yaml
done
