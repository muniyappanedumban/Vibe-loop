"""login safety: sessions, TOTP secret, recovery codes, security events

Revision ID: b8d2e4f6a1c3
Revises: a7c1d2e3f4b5
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b8d2e4f6a1c3'
down_revision: Union[str, Sequence[str], None] = 'a7c1d2e3f4b5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('totp_secret', sa.String(300), nullable=True))
    op.create_table('auth_sessions',
        sa.Column('id', sa.String(40), primary_key=True),
        sa.Column('user_id', sa.String(40), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('device_id', sa.String(64), nullable=False, server_default=''),
        sa.Column('device_name', sa.String(120), nullable=False, server_default=''),
        sa.Column('ip', sa.String(64), nullable=False, server_default=''),
        sa.Column('created_at', sa.BigInteger(), nullable=False),
        sa.Column('last_seen', sa.BigInteger(), nullable=False),
        sa.Column('revoked_at', sa.BigInteger(), nullable=True))
    op.create_index('ix_auth_sessions_user_id', 'auth_sessions', ['user_id'])
    op.create_index('ix_auth_sessions_device_id', 'auth_sessions', ['device_id'])
    op.create_table('recovery_codes',
        sa.Column('id', sa.String(40), primary_key=True),
        sa.Column('user_id', sa.String(40), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('code_hash', sa.String(64), nullable=False),
        sa.Column('used_at', sa.BigInteger(), nullable=True))
    op.create_index('ix_recovery_codes_user_id', 'recovery_codes', ['user_id'])
    op.create_table('security_events',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.String(40), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('at', sa.BigInteger(), nullable=False),
        sa.Column('kind', sa.String(40), nullable=False),
        sa.Column('detail', sa.String(300), nullable=False, server_default=''),
        sa.Column('ip', sa.String(64), nullable=False, server_default=''))
    op.create_index('ix_security_events_user_id', 'security_events', ['user_id'])
    op.create_index('ix_security_events_at', 'security_events', ['at'])


def downgrade() -> None:
    op.drop_table('security_events'); op.drop_table('recovery_codes'); op.drop_table('auth_sessions')
    op.drop_column('users', 'totp_secret')
