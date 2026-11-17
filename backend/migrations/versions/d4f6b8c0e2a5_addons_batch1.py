"""addons batch 1: Daily Spark, Time Capsules, Kudos (Glow); Pacts, Hush Tab, Safe Arrival (Hush)

Revision ID: d4f6b8c0e2a5
Revises: c3e5a7b9d2f4
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'd4f6b8c0e2a5'
down_revision: Union[str, Sequence[str], None] = 'c3e5a7b9d2f4'
branch_labels = None
depends_on = None

def _u(col='user_id', nullable=False): return sa.Column(col, sa.String(40), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=nullable, index=True)

def upgrade() -> None:
    op.create_table('spark_questions', sa.Column('day', sa.String(10), primary_key=True), sa.Column('text', sa.String(200), nullable=False),
                    sa.Column('set_by', sa.String(60), nullable=False, server_default=''), sa.Column('at', sa.BigInteger(), nullable=False))
    op.create_table('spark_answers', sa.Column('id', sa.String(40), primary_key=True), sa.Column('day', sa.String(10), nullable=False, index=True), _u(),
                    sa.Column('text', sa.String(280), nullable=False), sa.Column('cheers', sa.JSON(), nullable=True), sa.Column('at', sa.BigInteger(), nullable=False),
                    sa.UniqueConstraint('day', 'user_id', name='uq_spark_answer_day_user'))
    op.create_table('capsules', sa.Column('id', sa.String(40), primary_key=True), _u('owner_id'), sa.Column('title', sa.String(80), nullable=False),
                    sa.Column('text', sa.Text(), nullable=False), sa.Column('media_url', sa.String(200), nullable=True),
                    sa.Column('audience', sa.String(10), nullable=False, server_default='me'), sa.Column('unlock_at', sa.BigInteger(), nullable=False, index=True),
                    sa.Column('at', sa.BigInteger(), nullable=False))
    op.create_table('kudos', sa.Column('id', sa.String(40), primary_key=True), _u('from_id'), _u('to_id'),
                    sa.Column('kind', sa.String(20), nullable=False), sa.Column('note', sa.String(140), nullable=False, server_default=''),
                    sa.Column('at', sa.BigInteger(), nullable=False, index=True))
    op.create_table('pacts', sa.Column('id', sa.String(40), primary_key=True), sa.Column('conv_id', sa.String(40), nullable=False, index=True), _u('created_by'),
                    sa.Column('title', sa.String(80), nullable=False), sa.Column('items', sa.JSON(), nullable=True), sa.Column('due_at', sa.BigInteger(), nullable=True),
                    sa.Column('at', sa.BigInteger(), nullable=False))
    op.create_table('tabs', sa.Column('id', sa.String(40), primary_key=True), sa.Column('conv_id', sa.String(40), nullable=False, index=True), _u('paid_by'),
                    sa.Column('title', sa.String(80), nullable=False), sa.Column('amount', sa.Integer(), nullable=False), sa.Column('currency', sa.String(3), nullable=False, server_default='INR'),
                    sa.Column('split', sa.JSON(), nullable=True), sa.Column('settled', sa.JSON(), nullable=True), sa.Column('at', sa.BigInteger(), nullable=False))
    op.create_table('safe_arrivals', sa.Column('id', sa.String(40), primary_key=True), _u(), sa.Column('note', sa.String(120), nullable=False, server_default=''),
                    sa.Column('watchers', sa.JSON(), nullable=True), sa.Column('due_at', sa.BigInteger(), nullable=False, index=True),
                    sa.Column('status', sa.String(10), nullable=False, server_default='active', index=True), sa.Column('at', sa.BigInteger(), nullable=False),
                    sa.Column('closed_at', sa.BigInteger(), nullable=True))

def downgrade() -> None:
    for t in ('safe_arrivals', 'tabs', 'pacts', 'kudos', 'capsules', 'spark_answers', 'spark_questions'): op.drop_table(t)
