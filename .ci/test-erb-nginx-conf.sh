#!/bin/bash

# exit on error
set -euo pipefail

export LC_ALL=C
apt-get -qqqy update
apt-get -qqqy install ruby

cd $(dirname $0)

nginx_servers_erb="servers.conf.erb"
nginx_servers_conf="$(basename $nginx_servers_erb .erb)"

echo "# test $nginx_servers_erb erb syntax"
if [ ! -f "$nginx_servers_erb" ] ; then
    echo "ERROR: $nginx_servers_erb not found"
    exit 1
fi
( erb -P -x -T '-' $nginx_servers_erb | ruby -c ) || exit $?

echo "# generate nginx $nginx_servers_conf file"
# test nginx syntax
export PORT=${PORT:-80}
export SCALINGO_PRIVATE_BACKEND_HOSTNAME=${SCALINGO_PRIVATE_BACKEND_HOSTNAME:-app.ap-scalingo.private-network.internal}
export PUBLIC_FQDN=${PUBLIC_FQDN:-example.com}
erb $nginx_servers_erb > /etc/nginx/conf.d/$nginx_servers_conf

echo "# mock upstream hostnames for nginx config test"
echo "127.0.0.1 $SCALINGO_PRIVATE_BACKEND_HOSTNAME" >> /etc/hosts

echo "# test nginx $nginx_servers_conf syntax"
cat > /tmp/nginx-test.conf << 'EOF'
load_module modules/ngx_http_modsecurity_module.so;
events {}
http {
    include /etc/nginx/conf.d/*.conf;
}
EOF
nginx -t -c /tmp/nginx-test.conf 2>&1 || exit $?

echo "Test OK"