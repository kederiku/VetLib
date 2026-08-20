from typing import Annotated

from fastapi import APIRouter, Depends, status

from vetolib.identity.application.dto import RegisterClinicCommand
from vetolib.identity.application.use_cases import RegisterClinic
from vetolib.identity.presentation.dependencies import get_register_clinic
from vetolib.identity.presentation.schemas import (
    ClinicRegisteredResponse,
    RegisterClinicRequest,
)

router = APIRouter(prefix="/clinics", tags=["clinics"])


@router.post("/register", operation_id="registerClinic", status_code=status.HTTP_201_CREATED)
async def register_clinic(
    body: RegisterClinicRequest,
    use_case: Annotated[RegisterClinic, Depends(get_register_clinic)],
) -> ClinicRegisteredResponse:
    result = await use_case.execute(
        RegisterClinicCommand(
            clinic_name=body.clinic_name,
            phone=body.phone,
            email=body.email,
            password=body.password.get_secret_value(),
            first_name=body.first_name,
            last_name=body.last_name,
        )
    )
    return ClinicRegisteredResponse(clinic_id=result.clinic_id, user_id=result.user_id)
