from zipfile import ZipInfo


MAX_BACKUP_UPLOAD_SIZE = 128 * 1024 * 1024
MAX_BACKUP_UNCOMPRESSED_SIZE = 256 * 1024 * 1024
MAX_BACKUP_MEMBERS = 5000
MAX_BACKUP_COMPRESSION_RATIO = 200
MAX_RESTORE_REQUEST_OVERHEAD = 1024 * 1024
MAX_RESTORE_REQUEST_SIZE = MAX_BACKUP_UPLOAD_SIZE + MAX_RESTORE_REQUEST_OVERHEAD


class ArchiveMetadataLimitError(ValueError):
    """Raised when ZIP metadata exceeds a shared backup/restore quota."""

    def __init__(self, limit: str, message: str) -> None:
        super().__init__(message)
        self.limit = limit


def validate_zip_metadata(members: list[ZipInfo]) -> None:
    """Apply the ZIP quotas shared by generated backups and restore uploads."""
    if len(members) > MAX_BACKUP_MEMBERS:
        raise ArchiveMetadataLimitError(
            "members",
            "Backup archive contains too many files",
        )
    if sum(member.file_size for member in members) > MAX_BACKUP_UNCOMPRESSED_SIZE:
        raise ArchiveMetadataLimitError(
            "uncompressed_size",
            "Backup archive exceeds the extracted size limit"
        )
    if any(
        member.file_size > 0
        and member.file_size / max(member.compress_size, 1)
        > MAX_BACKUP_COMPRESSION_RATIO
        for member in members
    ):
        raise ArchiveMetadataLimitError(
            "compression_ratio",
            "Backup archive exceeds the compression ratio limit"
        )
