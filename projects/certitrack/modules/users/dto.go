package users

type UpdateUserDTO struct {
	Username *string `json:"username"`
	Password *string `json:"password"`
	Name     *string `json:"name"`
	Email    *string `json:"email"`
	Section  *string `json:"section"`
	Role     *string `json:"role"`
}
