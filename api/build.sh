#!/usr/bin/env bash
# Render build command. Runs on every deploy.
set -o errexit

pip install --upgrade pip
pip install pipenv
# Install exactly what's in Pipfile.lock, without a separate virtualenv.
pipenv requirements > /tmp/requirements.txt
pip install -r /tmp/requirements.txt

python manage.py collectstatic --no-input
python manage.py migrate --no-input
