"""trust & safety: media scan status, appeals, spam flags, hash blocklist, incidents

Revision ID: c3e5a7b9d2f4
Revises: b8d2e4f6a1c3
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c3e5a7b9d2f4'
down_revision: Union[str, Sequence[str], None] = 'b8d2e4f6a1c3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('media_files', sa.Column('scan_status', sa.String(10), nullable=False, server_default='clean'))
    op.add_column('media_files', sa.Column('sha256', sa.String(64), nullable=True))
    op.add_column('media_files', sa.Column('scan_note', sa.String(200), nullable=True))
    op.create_index('ix_media_files_scan_status', 'media_files', ['scan_status'])
    op.create_index('ix_media_files_sha256', 'media_files', ['sha256'])
    op.create_table('appeals',
        sa.Column('id', sa.String(40), primary_key=True),
        sa.Column('user_id', sa.String(40), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('kind', sa.String(10), nullable=False), sa.Column('target', sa.String(80), nullable=False, server_default=''),
        sa.Column('reason', sa.Text(), nullable=False, server_default=''),
        sa.Column('status', sa.String(12), nullable=False, server_default='open', index=True),
        sa.Column('note', sa.String(500), nullable=False, server_default=''), sa.Column('decided_by', sa.String(60), nullable=True),
        sa.Column('at', sa.BigInteger(), nullable=False, index=True), sa.Column('decided_at', sa.BigInteger(), nullable=True))
    op.create_table('spam_flags',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.String(40), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('kind', sa.String(30), nullable=False), sa.Column('detail', sa.String(300), nullable=False, server_default=''),
        sa.Column('status', sa.String(12), nullable=False, server_default='open', index=True),
        sa.Column('at', sa.BigInteger(), nullable=False, index=True))
    op.create_table('blocked_hashes',
        sa.Column('sha256', sa.String(64), primary_key=True), sa.Column('label', sa.String(120), nullable=False, server_default=''),
        sa.Column('added_by', sa.String(60), nullable=False, server_default=''), sa.Column('at', sa.BigInteger(), nullable=False))
    op.create_table('incidents',
        sa.Column('id', sa.String(40), primary_key=True),
        sa.Column('severity', sa.String(10), nullable=False, server_default='medium', index=True),
        sa.Column('kind', sa.String(30), nullable=False, server_default='manual'), sa.Column('title', sa.String(200), nullable=False),
        sa.Column('detail', sa.Text(), nullable=False, server_default=''),
        sa.Column('status', sa.String(15), nullable=False, server_default='open', index=True),
        sa.Column('user_id', sa.String(40), nullable=True), sa.Column('timeline', sa.JSON(), nullable=True),
        sa.Column('at', sa.BigInteger(), nullable=False, index=True), sa.Column('resolved_at', sa.BigInteger(), nullable=True))


def downgrade() -> None:
    for t in ('incidents', 'blocked_hashes', 'spam_flags', 'appeals'): op.drop_table(t)
    op.drop_index('ix_media_files_sha256', 'media_files'); op.drop_index('ix_media_files_scan_status', 'media_files')
    for c in ('scan_note', 'sha256', 'scan_status'): op.drop_column('media_files', c)
