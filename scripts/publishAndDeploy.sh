#!/bin/bash

echo "Please enter the version to publish in the following format: vX.X.X "
read version

echo "Please enter the account to deploy to: (merkl-dispute-1 or merkl-dispute-2)"
read account

sh scripts/publish.sh $account $version
sh scripts/deploy.sh $account $version
