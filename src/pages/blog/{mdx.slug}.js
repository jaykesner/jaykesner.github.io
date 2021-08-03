import * as React from "react";
import Layout from "../../components/layout";
import { graphql } from "gatsby";
import { MDXProvider } from "@mdx-js/react";
import { MDXRenderer } from "gatsby-plugin-mdx";

const pStyle = {
  fontSize: "1.25rem",
};

const codeStyle = {
  backgroundColor: "rgb(83, 83, 83)",
  color: "white",
  borderRadius: "4px",
  padding: "0.5rem",
};

const MdxPost = ({ data }) => {
  return (
    <Layout pageTitle={data.mdx.frontmatter.title}>
      <p>{data.mdx.frontmatter.date}</p>
      <MDXProvider
        components={{
          p: (props) => <p {...props} style={pStyle} />,
          inlineCode: (props) => <code {...props} style={codeStyle} />,
        }}
      >
        <MDXRenderer>{data.mdx.body}</MDXRenderer>
      </MDXProvider>
    </Layout>
  );
};

export const query = graphql`
  query ($id: String) {
    mdx(id: { eq: $id }) {
      frontmatter {
        title
        date(formatString: "MMMM D, YYYY")
      }
      body
    }
  }
`;

export default MdxPost;
