export const projectComposeTemplate = `name: devdeploy-__SLUG__-__SLOT__
services:
  app:
    image: __DIGEST__
    container_name: devdeploy-__SLUG__-__SLOT__
    restart: "no"
    read_only: true
    environment:
      PORT: "__PORT__"
    expose:
      - "__PORT__"
    networks:
      - devdeploy-runtime
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=32m
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    deploy:
      resources:
        limits:
          cpus: '0.50'
          memory: 256M
        reservations:
          memory: 64M
    logging:
      driver: journald
      options:
        tag: devdeploy-__SLUG__-__SLOT__
networks:
  devdeploy-runtime:
    external: true
`;
