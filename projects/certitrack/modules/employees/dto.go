package employees

type UpdateEmployeeDTO struct {
	NIK          *string `json:"nik"`
	Name         *string `json:"name"`
	Department   *string `json:"dept"`
	TypeEmployee *string `json:"type_employee"`
}

type ImportEmployeeDTO struct {
	NIK          string `json:"nik"`
	Name         string `json:"name"`
	Department   string `json:"dept"`
	TypeEmployee string `json:"type_employee"`
}
