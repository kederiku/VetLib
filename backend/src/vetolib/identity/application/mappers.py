from vetolib.identity.application.dto import CurrentUser
from vetolib.identity.domain.user import User


def to_current_user(user: User, clinic_name: str) -> CurrentUser:
    return CurrentUser(
        id=user.id,
        clinic_id=user.clinic_id,
        clinic_name=clinic_name,
        email=user.email.value,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        permissions=user.permissions,
    )
