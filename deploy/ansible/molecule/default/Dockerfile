# Image de test pour le scénario Molecule de deploy/ansible/lamp-setup.yml.
#
# ubuntu:26.04 pur ne fait tourner AUCUN init : son CMD par défaut attend juste une commande
# arbitraire. Pour tester systemctl/cron/sudo pour de vrai, il faut un vrai systemd en PID 1
# — d'où l'installation de systemd-sysv et le CMD sur /sbin/init. C'est un pattern standard
# (systemd-in-docker), qui exige côté molecule.yml : privileged, cgroupns_mode: host, et les
# tmpfs /run + /run/lock — voir les commentaires de molecule.yml.
FROM ubuntu:26.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      systemd systemd-sysv \
      python3 python3-apt \
      sudo openssh-client curl ca-certificates \
      # rsync : sert à prepare.yml pour copier le dépôt (monté en lecture seule) vers une
      # copie interne au conteneur, en excluant .git/node_modules/.venv — voir prepare.yml.
      rsync \
    # Les unités qui ne servent à rien dans un conteneur et ralentissent le démarrage de
    # systemd, voire le font échouer sur un hôte sans le matériel correspondant.
    && systemctl mask \
         systemd-udevd.service systemd-udevd.socket \
         systemd-remount-fs.service \
         dev-hugepages.mount sys-kernel-debug.mount \
         getty.target getty-static.service \
         swap.target \
    && rm -rf /var/lib/apt/lists/*

STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
