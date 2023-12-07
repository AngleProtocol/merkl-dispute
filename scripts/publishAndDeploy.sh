#!/bin/bash

echo "Please enter the version to publish in the following format: vX.X.X "
read version

echo "Please enter the account to deploy to: (merkl-dispute-1 or merkl-dispute-2)"
read account

echo "Please enter Github token to download the SDK"
read token

sh scripts/publish.sh $account $version $token
bash scripts/deploy.sh $account $version
