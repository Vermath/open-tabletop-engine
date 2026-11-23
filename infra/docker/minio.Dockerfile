FROM --platform=$BUILDPLATFORM registry.access.redhat.com/ubi9/ubi-minimal:9.9@sha256:08d4c70f1baf6537a0728656cf7942d561e74a35916509d205b6519861266352 AS fetch
ARG TARGETARCH
WORKDIR /verified
# These release binaries and their sidecars also shipped in the previous MinIO image.
RUN set -eu; \
    for name in minio mc; do \
      case "$name" in \
        minio) release=RELEASE.2025-04-22T22-12-26Z ;; \
        mc) release=RELEASE.2025-04-16T18-13-26Z ;; \
      esac; \
      url="https://github.com/minio/$name/releases/download/$release/$name.linux-$TARGETARCH.$release"; \
      for suffix in '' .minisig .sha256sum; do \
        curl --proto '=https' --proto-redir '=https' -fsSL --retry 3 "$url$suffix" -o "$name$suffix"; \
      done; \
    done
COPY minio-checksums/${TARGETARCH}.sha256 /tmp/release.sha256
RUN sha256sum --strict --check /tmp/release.sha256 && chmod 0755 minio mc

FROM registry.access.redhat.com/ubi9/ubi-minimal:9.9@sha256:08d4c70f1baf6537a0728656cf7942d561e74a35916509d205b6519861266352
COPY --from=fetch /verified/ /usr/bin/
ADD --checksum=sha256:c6a01decb5d104ef7327d0d642ce34bcc2396e600a1b7ba03568ac65b3d473be --chmod=0755 https://raw.githubusercontent.com/minio/minio/0d7408fc9969caf07de6a8c3a84f9fbb10a6739e/dockerscripts/docker-entrypoint.sh /usr/bin/docker-entrypoint.sh
ADD --checksum=sha256:0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0 --chmod=0644 https://raw.githubusercontent.com/minio/minio/0d7408fc9969caf07de6a8c3a84f9fbb10a6739e/LICENSE /licenses/LICENSE
ADD --checksum=sha256:113b8c63dfd987d3652950d7c2aecb1c0952b41781e79bcdac6a316418d48542 --chmod=0644 https://raw.githubusercontent.com/minio/minio/0d7408fc9969caf07de6a8c3a84f9fbb10a6739e/CREDITS /licenses/CREDITS
ENV MINIO_ACCESS_KEY_FILE=access_key \
    MINIO_SECRET_KEY_FILE=secret_key \
    MINIO_ROOT_USER_FILE=access_key \
    MINIO_ROOT_PASSWORD_FILE=secret_key \
    MINIO_KMS_SECRET_KEY_FILE=kms_master_key \
    MINIO_UPDATE_MINISIGN_PUBKEY=RWTx5Zr1tiHQLwG9keckT0c45M3AGeHD6IvimQHpyRywVWGbP1aVSGav \
    MINIO_CONFIG_ENV_FILE=config.env \
    MC_CONFIG_DIR=/tmp/.mc
EXPOSE 9000
VOLUME ["/data"]
ENTRYPOINT ["/usr/bin/docker-entrypoint.sh"]
CMD ["minio"]
