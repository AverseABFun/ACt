# ADt(Another Disease tracker) API documentation

## Create New Case

Endpoint: `/api/cases`
Method: `POST`
Description: This endpoint allows you to create a new case with the provided data.

### Request Body:
- `timestamp` (string): The timestamp of the case.
- `location` (string): The location of the case.
- `disease_guess` (string): The guess of the disease for the case.

### Response:
- `error` (boolean): If an error occurred
- `status` (string): The status of the request.
- `message` (string): A message indicating the result of the request.

## Get Number of Cases by Disease

Endpoint: `/api/cases/count`
Method: `GET`
Description: This endpoint allows you to get the number of cases for each disease guess.

### Response:
- `cases` (array): An array of objects with the following keys
    - `disease_guess` (string): The guess of the disease.
    - `count` (integer): The number of cases for the disease guess.
