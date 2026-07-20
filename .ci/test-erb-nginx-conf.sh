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
erb $nginx_servers_erb > /etc/nginx/conf.d/$nginx_servers_conf

echo "# mock upstream hostnames for nginx config test"
echo "127.0.0.1 app.ap-3c07e5a0-d7ff-4e88-b27e-3513b34b15e3.pn-17a0fab5-61c6-4fd5-b072-9e2da749b2ef.private-network.internal" >> /etc/hosts

echo "# test nginx $nginx_servers_conf syntax"
cat > /tmp/nginx-test.conf << 'EOF'

events {}
http {
    include /etc/nginx/conf.d/*.conf;
}
EOF
nginx -t -c /tmp/nginx-test.conf 2>&1 || exit $?

echo "Test OK"