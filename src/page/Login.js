import React from 'react'
class Login extends React.Component {
  render() {
    return (
      <div className="fullHeight">
        <div className="card col-sm-12 col-md-6">
          <div className="card-body">
            <form onSubmit={this.props.submit} method="post">
              <p className="h4 text-center py-4">Consultant Login</p>
              <label className="grey-text font-weight-light">Username</label>
              <input type="text" name="username" className="form-control" required />
              <br />
              <label className="grey-text font-weight-light">Password</label>
              <input type="password" name="password" className="form-control" required />
              <div className="text-center py-4 mt-3">
                <button className="btn btn-primary" type="submit">Send<i className="fa fa-paper-plane-o ml-2"></i></button>
              </div>
            </form>
          </div>
        </div>
      </div>
    )
  }
}
export default Login