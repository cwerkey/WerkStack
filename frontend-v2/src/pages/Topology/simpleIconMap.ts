/**
 * Curated icon lookup for common homelab OS, apps, and container images.
 * Uses simple-icons for monochrome SVG glyphs + brand colors.
 */

import {
  siDocker,
  siProxmox,
  siPortainer,
  siWireguard,
  siJellyfin,
  siPlex,
  siHomeassistant,
  siNginx,
  siUbuntu,
  siDebian,
  siGrafana,
  siRedis,
  siPostgresql,
  siMysql,
  siMongodb,
  siNextcloud,
  siGitea,
  siLinux,
  siArchlinux,
  siFedora,
  siFreebsd,
  siRaspberrypi,
  siAlpinelinux,
  siWordpress,
  siGithub,
  siGitlab,
  siPrometheus,
} from 'simple-icons';

type IconDef = { path: string; hex: string };

const ICON_MAP: Record<string, IconDef> = {
  docker: siDocker,
  proxmox: siProxmox,
  proxmoxve: siProxmox,
  portainer: siPortainer,
  wireguard: siWireguard,
  jellyfin: siJellyfin,
  plex: siPlex,
  homeassistant: siHomeassistant,
  ha: siHomeassistant,
  nginx: siNginx,
  nginxproxymanager: siNginx,
  ubuntu: siUbuntu,
  debian: siDebian,
  grafana: siGrafana,
  redis: siRedis,
  postgresql: siPostgresql,
  postgres: siPostgresql,
  mysql: siMysql,
  mariadb: siMysql,
  mongodb: siMongodb,
  mongo: siMongodb,
  nextcloud: siNextcloud,
  gitea: siGitea,
  linux: siLinux,
  archlinux: siLinux,
  arch: siArchlinux,
  fedora: siFedora,
  freebsd: siFreebsd,
  raspberrypi: siRaspberrypi,
  alpinelinux: siAlpinelinux,
  alpine: siAlpinelinux,
  wordpress: siWordpress,
  github: siGithub,
  gitlab: siGitlab,
  prometheus: siPrometheus,
};

/** Normalize an app name or container image string to an icon lookup slug. */
export function normalizeToSlug(raw: string): string {
  return raw
    .split('/').pop()!       // last path segment: "linuxserver/plex:latest" → "plex:latest"
    .split(':')[0]            // strip tag: "plex:latest" → "plex"
    .toLowerCase()
    .replace(/\s+\d[\d.]*$/, '') // strip trailing version: "proxmox ve 8.1" → "proxmox ve"
    .replace(/[^a-z0-9]/g, '');  // remove non-alphanumeric: "proxmox ve" → "proxmoxve"
}

/** Return path + hex color for a recognized name, or null if unknown. */
export function getIcon(name: string): IconDef | null {
  if (!name) return null;
  const slug = normalizeToSlug(name);
  return ICON_MAP[slug] ?? null;
}
